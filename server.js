require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const port = process.env.PORT || 3000;
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let collection;

app.use(bodyParser.json()); 

async function start() {
  try {
    await client.connect();
    const db = client.db('fileUploader');
    collection = db.collection('jsonFiles');
    console.log('connected to DB');

    app.listen(port, () => {
      console.log(`listening at http://localhost:${port}`);
    });
  } catch (err) {
    console.error('connection failed', err.message);
    process.exit(1);
  }
}

const API_KEY = process.env.API_KEY;

app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (API_KEY && key !== API_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || req.file.mimetype !== 'application/json') {
      return res.status(400).json({ error: 'Please upload a valid json file' });
    }

    const rawContent = req.file.buffer.toString('utf-8');
    const parsed = JSON.parse(rawContent);

    const db = client.db('fileUploader');
    const collection = db.collection('jsonFiles');

    await collection.insertOne({
      filename: req.file.originalname,
      data: parsed,
      uploadedAt: new Date()
    });

    res.status(200).json({ message: 'File uploaded' });

  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

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

app.get('/download/:filename', async (req, res) => {
  try {
    const db = client.db('fileUploader');
    const collection = db.collection('jsonFiles');

    const file = await collection.findOne({ filename: req.params.filename });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const jsonBuffer = Buffer.from(JSON.stringify(file.data, null, 2));

    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(jsonBuffer);

  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to download file' });
  }
});


start();