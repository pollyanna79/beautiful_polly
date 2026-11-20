const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
const api = express.Router();
app.use(cors());
app.use(express.json());

const requiredDatabaseVariables = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME_MYDB'];
const missingDatabaseVariables = requiredDatabaseVariables.filter((name) => !process.env[name]);
if (missingDatabaseVariables.length) {
    throw new Error(`Configure as variáveis do banco: ${missingDatabaseVariables.join(', ')}.`);
}

const sslCa = process.env.DB_SSL_CA
    ? process.env.DB_SSL_CA.replace(/\\n/g, '\n')
    : undefined;

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME_MYDB,
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
     connectTimeout: 10000,
    ssl: {
        rejectUnauthorized: false,
        ca: process.env.DB_SSL_CA
    }
});

const normalize = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const allowedCities = new Map([
    ['maua', 'Mauá'],
    ['santo andre', 'Santo André'],
    ['sao caetano', 'São Caetano do Sul'],
    ['sao caetano do sul', 'São Caetano do Sul'],
    ['ribeirao pires', 'Ribeirão Pires'],
    ['capuava', 'Capuava']
]);
// Responde com erro claro (em vez de derrubar a função) quando faltam variáveis de ambiente.
api.use((req, res, next) => {
    if (db) return next();
    res.status(503).json({
        erro: `Variáveis de ambiente ausentes: ${missingDatabaseVariables.join(', ')}.`
    });
});
api.get('/health', (req, res) => {
    db.query('SELECT 1 AS ok, DATABASE() AS banco', (error, rows) => {
        if (error) {
            console.error('Falha no teste de conexão com o banco:', error);
            return res.status(500).json({ ok: false, codigo: error.code, erro: error.message });
        }
        res.json({ ok: true, banco: rows[0].banco });
    });
});
api.get('/servicos', (req, res) => {
    const sql = `
        SELECT id_servico, nome_servico, preco, duracao_estimada, id_funcionario
        FROM servicos
        ORDER BY nome_servico
    `;

    db.query(sql, (error, services) => {
        if (error) {
            console.error('Erro ao carregar serviços do banco:', error);
            return res.status(500).json({ erro: 'Não foi possível carregar o catálogo de serviços.' });
        }
        res.json(services);
    });
});

api.get('/horarios', (req, res) => {
    const serviceId = Number(req.query.id_servico);
    const date = String(req.query.data || '');
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const validDate = dateParts && new Date(Date.UTC(
        Number(dateParts[1]),
        Number(dateParts[2]) - 1,
        Number(dateParts[3])
    )).toISOString().slice(0, 10) === date;

    if (!Number.isSafeInteger(serviceId) || serviceId <= 0 || !validDate) {
        return res.status(400).json({ erro: 'Informe um serviço e uma data válidos.' });
    }

    const sql = `
        SELECT TIME_FORMAT(a.data_agenda, '%H:%i') AS hora,
               TIME_TO_SEC(s.duracao_estimada) AS duracao_segundos
        FROM agenda_cliente a
        INNER JOIN servicos s ON s.id_servico = a.id_servico
        WHERE a.id_servico = ? AND DATE(a.data_agenda) = ?
        ORDER BY a.data_agenda
    `;

    db.query(sql, [serviceId, date], (error, reservations) => {
        if (error) {
            console.error('Erro ao consultar horários reservados:', error);
            return res.status(500).json({ erro: 'Não foi possível consultar os horários disponíveis.' });
        }
        res.json(reservations);
    });
});

api.get('/detalhe_agendamento', (req, res) => {
    const searchTerm = String(req.query.busca || req.query.Nome || req.query.nome || req.query.email || req.query.Email || '').trim();
    if (!searchTerm) return res.status(400).json({ erro: 'Informe o nome ou e-mail do cliente.' });

    const sql = `
        SELECT d.*
        FROM mydb.detalhe_agendamento d
        INNER JOIN mydb.tbl_clientes c ON c.idclientes = d.Cod
        WHERE LOWER(d.Nome) LIKE LOWER(?) OR LOWER(c.email) = LOWER(?)
    `;
    db.query(sql, [`%${searchTerm}%`, searchTerm], (error, reservations) => {
        if (error) {
            console.error('Erro ao consultar reservas:', error);
            return res.status(500).json({ erro: 'Não foi possível consultar as reservas.' });
        }
        res.json(reservations);
    });
});

api.post('/tbl_clientes', (req, res) => {
    const {
        cliente_nome,
        telefone,
        email,
        endereco,
        cpf,
        cidade,
        cep,
        id_servico,
        data_agenda
    } = req.body || {};
    const canonicalCity = allowedCities.get(normalize(cidade));
    const serviceId = Number(id_servico);
    const appointmentDate = String(data_agenda || '').trim().replace('T', ' ');
    const validDateTime = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(appointmentDate);
    const requiredFields = [cliente_nome, telefone, email, endereco, cpf, cep];

    if (
        requiredFields.some((value) => !String(value || '').trim()) ||
        !canonicalCity || !Number.isSafeInteger(serviceId) || serviceId <= 0 ||
        !validDateTime
    ) {
        return res.status(400).json({
            status: 'erro',
            erro: 'Preencha os dados corretamente e informe uma cidade atendida.'
        });
    }

    const normalizedDate = appointmentDate.length === 16 ? `${appointmentDate}:00` : appointmentDate;
    db.getConnection((connectionError, connection) => {
        if (connectionError) {
            console.error('Erro ao obter conexão para agendamento:', connectionError);
            return res.status(500).json({ status: 'erro', erro: 'Não foi possível iniciar o agendamento.' });
        }

        connection.beginTransaction((transactionError) => {
            if (transactionError) {
                connection.release();
                console.error('Erro ao iniciar transação do agendamento:', transactionError);
                return res.status(500).json({ status: 'erro', erro: 'Não foi possível iniciar o agendamento.' });
            }

            const rollback = (statusCode, message, error) => {
                if (error) console.error(message, error);
                connection.rollback(() => {
                    connection.release();
                    res.status(statusCode).json({ status: 'erro', erro: message });
                });
            };

            connection.query(
                'SELECT id_servico, TIME_TO_SEC(duracao_estimada) AS duracao_segundos FROM servicos WHERE id_servico = ? FOR UPDATE',
                [serviceId],
                (serviceError, services) => {
                    if (serviceError) {
                        return rollback(500, 'Não foi possível validar o serviço.', serviceError);
                    }
                    if (!services.length) {
                        return rollback(400, 'O serviço selecionado não está disponível.');
                    }

                    const duration = Number(services[0].duracao_segundos);
                    const overlapSql = `
                        SELECT a.id_servico
                        FROM agenda_cliente a
                        INNER JOIN servicos s ON s.id_servico = a.id_servico
                        WHERE a.id_servico = ?
                          AND a.data_agenda < DATE_ADD(?, INTERVAL ? SECOND)
                          AND DATE_ADD(a.data_agenda, INTERVAL TIME_TO_SEC(s.duracao_estimada) SECOND) > ?
                        LIMIT 1
                    `;
                    connection.query(
                        overlapSql,
                        [serviceId, normalizedDate, duration, normalizedDate],
                        (overlapError, overlaps) => {
                            if (overlapError) {
                                return rollback(500, 'Não foi possível verificar a disponibilidade do horário.', overlapError);
                            }
                            if (overlaps.length) {
                                return rollback(409, 'Este horário acabou de ser reservado. Escolha outro horário.');
                            }

                            const clientSql = `
                                INSERT INTO tbl_clientes (cliente_nome, telefone, email, endereco, cpf, cidade, cep)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            `;
                            const clientValues = [
                                String(cliente_nome).trim(),
                                String(telefone).trim(),
                                String(email).trim(),
                                String(endereco).trim(),
                                String(cpf).trim(),
                                canonicalCity,
                                String(cep).trim()
                            ];

                            connection.query(clientSql, clientValues, (clientError, clientResult) => {
                                if (clientError) {
                                    return rollback(500, 'Erro ao cadastrar cliente no banco.', clientError);
                                }

                                const appointmentSql = `
                                    INSERT INTO agenda_cliente (data_agenda, id_servico, id_cliente)
                                    VALUES (?, ?, ?)
                                `;
                                connection.query(
                                    appointmentSql,
                                    [normalizedDate, serviceId, clientResult.insertId],
                                    (appointmentError) => {
                                        if (appointmentError) {
                                            return rollback(500, 'Erro ao salvar a reserva na agenda.', appointmentError);
                                        }

                                        connection.commit((commitError) => {
                                            if (commitError) {
                                                return rollback(500, 'Erro ao concluir a reserva.', commitError);
                                            }
                                            connection.release();
                                            res.status(201).json({
                                                status: 'sucesso',
                                                mensagem: 'Cliente cadastrado e horário agendado com sucesso!'
                                            });
                                        });
                                    }
                                );
                            });
                        }
                    );
                }
            );
        });
    });
});

app.use('/api', api);
app.use('/', api);

const port = Number(process.env.PORT) || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
  });
}

module.exports = app;
