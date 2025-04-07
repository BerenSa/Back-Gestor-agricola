// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { router, updateData } = require('./routes/api');
const { routerAM, getData } = require('./routes/dataAM');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
  origin: "*"
}));

app.use(express.json());
app.use('/api', router);
app.use('/api', routerAM);

// Llamada inicial y luego cada 30 segundos para actualizar la BD
updateData();
setInterval(updateData, 30 * 1000);

// Llamada inicial y luego cada 30 segundos para actualizar zonas de riego
getData();
setInterval(getData, 30 * 1000);

app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
