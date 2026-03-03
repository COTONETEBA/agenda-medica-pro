const jwt = require("jsonwebtoken");

function verificarToken(req, res, next) {
    const token = req.headers.authorization;

    if (!token) {
        return res.status(401).json({ erro: "Acesso negado" });
    }

    try {
        const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (err) {
        res.status(400).json({ erro: "Token inválido" });
    }
}

module.exports = verificarToken;