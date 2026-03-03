require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cron = require("node-cron");
const axios = require("axios");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use("/uploads", express.static("uploads"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// CONFIGURAÇÃO UPLOAD
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

// ============================
// REGISTRAR USUÁRIO
// ============================
app.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (name,email,password,role) VALUES ($1,$2,$3,$4)",
      [name, email, hash, role]
    );

    res.json({ message: "Usuário criado com sucesso" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// LOGIN
// ============================
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (user.rows.length === 0)
      return res.status(401).json({ error: "Usuário não encontrado" });

    const valid = await bcrypt.compare(password, user.rows[0].password);
    if (!valid)
      return res.status(401).json({ error: "Senha incorreta" });

    const token = jwt.sign(
      { id: user.rows[0].id, role: user.rows[0].role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ token, role: user.rows[0].role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// CRIAR CONSULTA
// ============================
app.post("/appointment", upload.single("photo"), async (req, res) => {
  try {
    const { user_id, person, doctor, datetime, reminder_minutes } = req.body;
    const photo = req.file ? req.file.filename : null;

    await pool.query(
      "INSERT INTO appointments (user_id,person,doctor,datetime,reminder_minutes,photo) VALUES ($1,$2,$3,$4,$5,$6)",
      [user_id, person, doctor, datetime, reminder_minutes, photo]
    );

    res.json({ message: "Consulta criada com sucesso" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// CRIAR MEDICAMENTO
// ============================
app.post("/medicine", async (req, res) => {
  try {
    const { user_id, person, name, time, duration_days, start_date } = req.body;

    await pool.query(
      "INSERT INTO medicines (user_id,person,name,time,duration_days,start_date) VALUES ($1,$2,$3,$4,$5,$6)",
      [user_id, person, name, time, duration_days, start_date]
    );

    res.json({ message: "Medicamento cadastrado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// AGENDADOR AUTOMÁTICO
// ============================
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    const result = await pool.query("SELECT * FROM appointments");

    for (let a of result.rows) {
      const reminderTime = new Date(a.datetime);
      reminderTime.setMinutes(reminderTime.getMinutes() - a.reminder_minutes);

      if (Math.abs(now - reminderTime) < 60000) {
        await axios.post(
          `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`,
          {
            phone: process.env.WHATSAPP_NUMBER,
            message: `Lembrete: Consulta de ${a.person} com ${a.doctor} em ${a.datetime}`
          }
        );
      }
    }
  } catch (err) {
    console.log("Erro no cron:", err.message);
  }
});

// ============================
// INICIAR SERVIDOR
// ============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});