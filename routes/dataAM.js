const axios = require('axios');
const pool = require('../config/db'); // pool de MySQL
const express = require('express');
const routerAM = express.Router();

const getData = async () => {
    try {
        const apiResponse = await axios.get('https://moriahmkt.com/iotapp/am');
        const data = apiResponse.data.zonas;

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            for (const zona of data) {
                const query = `
                    INSERT INTO zonas_riego (id, sector, nombre, tipo_riego, estado, latitud, longitud, motivo, fecha, color)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    sector = VALUES(sector), nombre = VALUES(nombre), tipo_riego = VALUES(tipo_riego),
                    estado = VALUES(estado), latitud = VALUES(latitud), longitud = VALUES(longitud),
                    motivo = VALUES(motivo), fecha = VALUES(fecha), color = VALUES(color)
                `;
                const values = [
                    zona.id, zona.sector, zona.nombre, zona.tipo_riego, zona.estado,
                    zona.latitud, zona.longitud, zona.motivo, zona.fecha, zona.color
                ];
                await connection.query(query, values);
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error fetching or saving data:", error);
    }
};

// Endpoint to fetch all zones
routerAM.get('/zonas-riego', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM zonas_riego');
        res.json(rows);
    } catch (error) {
        console.error("Error fetching zones:", error);
        res.status(500).send("Error fetching zones");
    }
});

// Endpoint to fetch zones that are not functioning
routerAM.get('/zonas-riego/no-funcionando', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM zonas_riego WHERE estado IN ("mantenimiento", "descompuesto", "fuera_de_servicio")'
        );
        res.json(rows);
    } catch (error) {
        console.error("Error fetching non-functioning zones:", error);
        res.status(500).send("Error fetching non-functioning zones");
    }
});

// Endpoint to fetch zones by state
routerAM.get('/zonas-riego/estado/:estado', async (req, res) => {
    const { estado } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM zonas_riego WHERE estado = ?', [estado]);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching zones by state:", error);
        res.status(500).send("Error fetching zones by state");
    }
});

module.exports = { getData, routerAM };
