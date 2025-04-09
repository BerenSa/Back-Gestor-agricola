// routes/api.js
const express = require('express');
const axios = require('axios');
const pool = require('../config/db'); // pool de MySQL
const router = express.Router();

// Función que actualiza la base de datos usando la API externa
async function updateData() {
  try {
    console.log('Iniciando actualización:', new Date().toISOString());
    const apiResponse = await axios.get('http://moriahmkt.com/iotapp/updated/');
    const data = apiResponse.data;
    
    console.log('Datos recibidos de la API:', {
      fecha_sensores: data.sensores.fecha,
      total_parcelas: data.parcelas.length
    });

    // Procesar cada parcela primero
    for (const parcela of data.parcelas) {
      console.log(`Procesando parcela ${parcela.id}:`, {
        nombre: parcela.nombre,
        ultimo_riego: parcela.ultimo_riego
      });

      // Obtener datos actuales de la parcela
      const [currentParcelaData] = await pool.query(
        'SELECT ultimo_riego FROM parcelas WHERE id = ?', 
        [Number(parcela.id)]
      );

      // Forzar actualización si los datos son diferentes
      const shouldUpdate = !currentParcelaData.length || 
                          currentParcelaData[0].ultimo_riego !== parcela.ultimo_riego;

      if (shouldUpdate) {
        console.log(`Actualizando parcela ${parcela.id} - Datos diferentes detectados`);
        
        const query = currentParcelaData.length === 0 
          ? `INSERT INTO parcelas (id, nombre, ubicacion, responsable, tipo_cultivo, 
                                 ultimo_riego, latitud, longitud, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, false)`
          : `UPDATE parcelas 
             SET nombre = ?, ubicacion = ?, responsable = ?, tipo_cultivo = ?,
                 ultimo_riego = ?, latitud = ?, longitud = ?, is_deleted = false
             WHERE id = ?`;

        const params = currentParcelaData.length === 0
          ? [Number(parcela.id), parcela.nombre, parcela.ubicacion, parcela.responsable,
             parcela.tipo_cultivo, parcela.ultimo_riego, parcela.latitud, parcela.longitud]
          : [parcela.nombre, parcela.ubicacion, parcela.responsable, parcela.tipo_cultivo,
             parcela.ultimo_riego, parcela.latitud, parcela.longitud, Number(parcela.id)];

        await pool.query(query, params);

        // Forzar actualización de sensores
        const insertSensorQuery = `
          INSERT INTO historico_sensores_parcela
            (parcela_id, humedad, temperatura, lluvia, sol)
          VALUES (?, ?, ?, ?, ?)
        `;
        await pool.query(insertSensorQuery, [
          Number(parcela.id),
          parcela.sensor.humedad,
          parcela.sensor.temperatura,
          parcela.sensor.lluvia,
          parcela.sensor.sol,
        ]);

        console.log(`Parcela ${parcela.id} actualizada con éxito`);
      }
    }

    // Procesar datos globales
    const [globalResult] = await pool.query(
      'SELECT * FROM historico_sensores_globales ORDER BY fecha_registro DESC LIMIT 1'
    );
    const lastGlobal = globalResult[0];
    console.log('Último registro global en BD:', lastGlobal?.fecha_registro);

    if (
      !lastGlobal ||
      lastGlobal.humedad_global != data.sensores.humedad ||
      lastGlobal.temperatura_global != data.sensores.temperatura ||
      lastGlobal.lluvia_global != data.sensores.lluvia ||
      lastGlobal.sol_global != data.sensores.sol
    ) {
      const insertGlobalQuery = `
        INSERT INTO historico_sensores_globales
          (humedad_global, temperatura_global, lluvia_global, sol_global)
        VALUES (?, ?, ?, ?)
      `;
      await pool.query(insertGlobalQuery, [
        data.sensores.humedad,
        data.sensores.temperatura,
        data.sensores.lluvia,
        data.sensores.sol,
      ]);
    }

    // Marcar parcelas eliminadas: si en la BD existen parcelas que no están en la API, se actualiza is_deleted a 1
    const [dbParcelasResult] = await pool.query('SELECT id FROM parcelas WHERE is_deleted = false');
    const dbParcelasIds = dbParcelasResult.map(row => Number(row.id));
    console.log("DB Parcelas IDs:", dbParcelasIds);

    for (const id of dbParcelasIds) {
      if (!apiParcelasIds.includes(id)) {
        console.log(`Marcando la parcela ${id} como eliminada`);
        await pool.query('UPDATE parcelas SET is_deleted = true WHERE id = ?', [id]);
      }
    }

    console.log("Actualización completada");

    // Agregar el intervalo de actualización cuando se inicia el router
    if (!global.updateInterval) {
      global.updateInterval = setInterval(async () => {
        try {
          await updateData();
          console.log('Actualización automática completada');
        } catch (error) {
          console.error('Error en actualización automática:', error);
        }
      }, 5000); // 5 segundos
    }

    return true; // Indicar que la actualización fue exitosa
  } catch (err) {
    console.error("Error detallado en updateData:", {
      message: err.message,
      stack: err.stack,
      response: err.response?.data
    });
    throw err;
  }
}

// Endpoint para actualizar la BD manualmente
router.get('/update-data', async (req, res) => {
  try {
    const result = await updateData();
    res.json({ 
      status: 'Base de datos actualizada correctamente',
      timestamp: new Date().toISOString(),
      success: result
    });
  } catch (err) {
    console.error('Error en endpoint update-data:', err);
    res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString(),
      details: err.response?.data || 'No additional details'
    });
  }
});

// Endpoint para obtener parcelas activas
router.get('/parcelas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM parcelas WHERE is_deleted = false');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para obtener el histórico de sensores de una parcela
router.get('/historico/parcelas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM historico_sensores_parcela WHERE parcela_id = ? ORDER BY fecha_registro ASC',
      [Number(id)]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para obtener parcelas eliminadas
router.get('/parcelas/eliminadas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM parcelas WHERE is_deleted = true');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para mostrar el contenido completo de la BD (para depuración)
router.get('/dump', async (req, res) => {
  try {
    const [parcelas] = await pool.query('SELECT * FROM parcelas');
    const [historico] = await pool.query('SELECT * FROM historico_sensores_parcela');
    let globales = [];
    try {
      const [globalResult] = await pool.query('SELECT * FROM historico_sensores_globales');
      globales = globalResult;
    } catch (err) {
      console.warn("No se encontró la tabla historico_sensores_globales (opcional).");
    }
    res.json({
      parcelas,
      historico,
      globales
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agregar un endpoint para verificar el estado de las actualizaciones
router.get('/update-status', async (req, res) => {
  try {
    const [lastGlobal] = await pool.query(
      'SELECT fecha_registro FROM historico_sensores_globales ORDER BY fecha_registro DESC LIMIT 1'
    );
    const [lastParcela] = await pool.query(
      'SELECT fecha_registro FROM historico_sensores_parcela ORDER BY fecha_registro DESC LIMIT 1'
    );
    
    res.json({
      lastGlobalUpdate: lastGlobal[0]?.fecha_registro,
      lastParcelaUpdate: lastParcela[0]?.fecha_registro,
      updateInterval: !!global.updateInterval,
      currentTime: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, updateData };
