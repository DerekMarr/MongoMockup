require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
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
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, buffer, mimetype } = req.file;
    const extension = path.extname(originalname).toLowerCase();

    const db = client.db('fileUploader');

    let parsedData;
    let collectionName;

    if (extension === '.json') {
      parsedData = JSON.parse(buffer.toString('utf8'));
      collectionName = 'jsonFiles';
    } else if (extension === '.txt') {
      parsedData = buffer.toString('utf8');
      collectionName = 'textFiles';
    } else if (extension === '.bson') {
      const BSON = require('bson');
      parsedData = BSON.deserialize(buffer);
      collectionName = 'bsonFiles';
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    await db.collection(collectionName).insertOne({
      filename: originalname,
      data: parsedData,
      uploadedAt: new Date()
    });

    res.status(200).json({ message: `${extension} file uploaded and saved` });

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

app.post('/search', async (req, res) => {
  try {
    const { field, value, fileType = 'json' } = req.body;

    const collectionMap = {
      json: 'jsonFiles',
      txt: 'textFiles',
      bson: 'bsonFiles'
    };

    const collectionName = collectionMap[fileType];
    if (!collectionName) return res.status(400).json({ error: 'Invalid file type' });

    const query = {};
    query[`data.${field}`] = value;

    const db = client.db('fileUploader');
    const results = await db.collection(collectionName).find(query).toArray();

    res.status(200).json({ count: results.length, results });

  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/download/:filename', async (req, res) => {
  try {
    const { type = 'json' } = req.query;
    const collectionMap = {
      json: 'jsonFiles',
      txt: 'textFiles',
      bson: 'bsonFiles'
    };
    const collectionName = collectionMap[type];
    if (!collectionName) return res.status(400).json({ error: 'Invalid file type' });

    const db = client.db('fileUploader');
    const file = await db.collection(collectionName).findOne({ filename: req.params.filename });

    if (!file) return res.status(404).json({ error: 'File not found' });

    const content =
      type === 'txt' ? file.data :
      type === 'json' ? JSON.stringify(file.data, null, 2) :
      type === 'bson' ? Buffer.from(require('bson').serialize(file.data)) : '';

    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type',
      type === 'json' ? 'application/json' :
      type === 'txt' ? 'text/plain' :
      'application/octet-stream'
    );

    res.send(content);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to download file' });
  }
});


start();