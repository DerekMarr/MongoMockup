require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';

const client = new MongoClient(uri);
let collection;

app.use(bodyParser.json()); //read json

async function start() {//connect
  try {
    await client.connect();
    const db = client.db('fileUploader');
    collection = db.collection('jsonFiles');
    console.log('connected to DB');

    // Start server
    app.listen(port, () => {
      console.log(`listening at http://localhost:${port}`);
    });
  } catch (err) {
    console.error('connection failed', err.message);
    process.exit(1);
  }
}

app.get('/files', async (req, res) => { // get /files  all
  try {
    const files = await collection.find({}, { projection: { filename: 1, uploadedAt: 1 } }).toArray();
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'failed to get files' });
  }
});

app.get('/files/:filename', async (req, res) => { // get /files/:filename one
  try {
    const file = await collection.findOne({ filename: req.params.filename });
    if (!file) return res.status(404).json({ error: 'file not found' });
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: 'failed to get file' });
  }
});

app.post('/search', async (req, res) => { // post /search value
  const { field, value } = req.body;
  if (!field || typeof value === 'undefined') {
    return res.status(400).json({ error: 'incomplete request body' });
  }

  try {
    const query = {};
    query[`data.${field}`] = value;
    const results = await collection.find(query).toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'search failed' });
  }
});

start();