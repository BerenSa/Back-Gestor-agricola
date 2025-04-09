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
                // Format values
                const formattedZona = {
                    id: zona.id,
                    sector: zona.sector,
                    nombre: zona.nombre,
                    tipo_riego: zona.tipo_riego,
                    estado: zona.estado ? zona.estado.toLowerCase() : null,
                    latitud: zona.latitud !== null ? parseFloat(zona.latitud) : null,
                    longitud: zona.longitud !== null ? parseFloat(zona.longitud) : null,
                    motivo: zona.motivo || null,
                    fecha: zona.fecha || null,
                    color: zona.color || null
                };

                const query = `
                    INSERT INTO zonas_riego (id, sector, nombre, tipo_riego, estado, latitud, longitud, motivo, fecha, color)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    sector = VALUES(sector), nombre = VALUES(nombre), tipo_riego = VALUES(tipo_riego),
                    estado = VALUES(estado), latitud = VALUES(latitud), longitud = VALUES(longitud),
                    motivo = VALUES(motivo), fecha = VALUES(fecha), color = VALUES(color)
                `;
                const values = [
                    formattedZona.id, formattedZona.sector, formattedZona.nombre, formattedZona.tipo_riego,
                    formattedZona.estado, formattedZona.latitud, formattedZona.longitud,
                    formattedZona.motivo, formattedZona.fecha, formattedZona.color
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
            'SELECT * FROM zonas_riego WHERE LOWER(estado) IN ("mantenimiento", "descompuesto", "fuera_de_servicio", "apagado")'
        );
        res.json(rows);
    } catch (error) {
        console.error("Error fetching non-functioning zones:", error);
        res.status(500).send("Error fetching non-functioning zones");
    }
});

// Endpoint to fetch zones that are functioning
routerAM.get('/zonas-riego/funcionando', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM zonas_riego WHERE LOWER(estado) NOT IN ("mantenimiento", "descompuesto", "fuera_de_servicio", "apagado")'
        );
        res.json(rows);
    } catch (error) {
        console.error("Error fetching functioning zones:", error);
        res.status(500).send("Error fetching functioning zones");
    }
});

// Endpoint to fetch zones by state
routerAM.get('/zonas-riego/estado/:estado', async (req, res) => {
    let { estado } = req.params;
    estado = estado.toLowerCase(); // Ensure "estado" is in lowercase
    try {
        const [rows] = await pool.query('SELECT * FROM zonas_riego WHERE LOWER(estado) = ?', [estado]);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching zones by state:", error);
        res.status(500).send("Error fetching zones by state");
    }
});

module.exports = { getData, routerAM };
