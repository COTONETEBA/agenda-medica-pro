require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Pool } = require("pg");
const verificarToken = require("./middleware/auth");

const app = express();

// ==========================
// MIDDLEWARES
// ==========================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ==========================
// CONEXÃO POSTGRES (Render)
// ==========================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
});

// ==========================
// CRIAR TABELAS AUTOMÁTICO
// ==========================

async function criarTabelas() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome TEXT,
                email TEXT UNIQUE,
                senha TEXT,
                tipo TEXT
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS consultas (
                id SERIAL PRIMARY KEY,
                paciente TEXT,
                data DATE,
                hora TIME
            );
        `);

        console.log("Tabelas prontas");
    } catch (err) {
        console.error("Erro ao criar tabelas:", err);
    }
}

criarTabelas();

// ==========================
// UPLOAD
// ==========================

const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage });

// ==========================
// NÚMEROS WHATSAPP
// ==========================

const NUMEROS_FIXOS = [
    "5527981454906",
    "5527993099838"
];

// ==========================
// FUNÇÃO WHATSAPP
// ==========================

function gerarLinkWhatsApp(numero, mensagem) {
    const numeroFormatado = numero.replace(/\D/g, "");
    const mensagemCodificada = encodeURIComponent(mensagem);
    return `https://wa.me/${numeroFormatado}?text=${mensagemCodificada}`;
}

// ==========================
// ROTAS
// ==========================

// Cadastro usuário
app.post("/register", async (req, res) => {
    try {
        const { nome, email, senha, tipo } = req.body;

        const hash = await bcrypt.hash(senha, 10);

        await pool.query(
            "INSERT INTO usuarios (nome, email, senha, tipo) VALUES ($1,$2,$3,$4)",
            [nome, email, hash, tipo]
        );

        res.json({ mensagem: "Usuário criado" });

    } catch (err) {
        res.status(500).json({ erro: "Erro ao criar usuário" });
    }
});

// Login
app.post("/login", async (req, res) => {
    try {
        const { email, senha } = req.body;

        const result = await pool.query(
            "SELECT * FROM usuarios WHERE email = $1",
            [email]
        );

        if (result.rows.length === 0)
            return res.status(400).json({ erro: "Usuário não encontrado" });

        const usuario = result.rows[0];

        const senhaValida = await bcrypt.compare(senha, usuario.senha);

        if (!senhaValida)
            return res.status(400).json({ erro: "Senha inválida" });

        const token = jwt.sign(
            { id: usuario.id, tipo: usuario.tipo },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.json({ token, tipo: usuario.tipo });

    } catch (err) {
        res.status(500).json({ erro: "Erro no login" });
    }
});

// Criar consulta (somente gestor)
app.post("/consulta", verificarToken, async (req, res) => {
    try {
        if (req.usuario.tipo !== "gestor")
            return res.status(403).json({ erro: "Sem permissão" });

        const { paciente, data, hora } = req.body;

        await pool.query(
            "INSERT INTO consultas (paciente, data, hora) VALUES ($1,$2,$3)",
            [paciente, data, hora]
        );

        res.json({ mensagem: "Consulta cadastrada" });

    } catch (err) {
        res.status(500).json({ erro: "Erro ao cadastrar consulta" });
    }
});

// Listar consultas
app.get("/consultas", verificarToken, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM consultas ORDER BY data, hora"
        );
        res.json(result.rows);
    } catch {
        res.status(500).json({ erro: "Erro ao listar consultas" });
    }
});

// Gerar lembrete para múltiplos números
app.get("/gerar-lembrete/:id", verificarToken, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            "SELECT * FROM consultas WHERE id = $1",
            [id]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ erro: "Consulta não encontrada" });

        const c = result.rows[0];

        const mensagem = 
`Lembrete de consulta médica

Paciente: ${c.paciente}
Data: ${c.data}
Hora: ${c.hora}`;

        const links = NUMEROS_FIXOS.map(numero =>
            gerarLinkWhatsApp(numero, mensagem)
        );

        res.json({ links });

    } catch {
        res.status(500).json({ erro: "Erro ao gerar lembrete" });
    }
});

// Upload receita
app.post("/upload", verificarToken, upload.single("receita"), (req, res) => {
    res.json({ arquivo: req.file.filename });
});

// ==========================
// PORTA (Render usa dinâmica)
// ==========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});