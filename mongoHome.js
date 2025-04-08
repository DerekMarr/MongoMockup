require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { streamValues } = require('stream-json/streamers/StreamValues');

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);
const watchFolder = path.join(__dirname, 'uploads');
const processedFiles = new Set();

async function run() {
  try {
    await client.connect();
    console.log('Connected to Database');

    const db = client.db('fileUploader');
    const collection = db.collection('jsonFiles');

    if (!fs.existsSync(watchFolder)) {
      fs.mkdirSync(watchFolder);
    }

    fs.watch(watchFolder, (eventType, filename) => {
      if (filename && eventType === 'rename' && filename.endsWith('.json')) {
        const filePath = path.join(watchFolder, filename);

        setTimeout(() => { // Delay to let file finish writing
          if (fs.existsSync(filePath) && !processedFiles.has(filename)) {
            processedFiles.add(filename);

            const pipeline = chain([
              fs.createReadStream(filePath),
              parser(),
              streamValues()
            ]);

            let parsedData;

            pipeline.on('data', ({ value }) => {
              parsedData = value;
            });

            pipeline.on('end', async () => {
              try {
                await collection.insertOne({
                  filename,
                  data: parsedData,
                  uploadedAt: new Date()
                });
                console.log(`Inserted ${filename}`);
              } catch (err) {
                console.error(`Failed to insert ${filename}`, err.message);
              } finally {
                setTimeout(() => processedFiles.delete(filename), 10000); // Allow reprocessing if needed after a few seconds
              }
            });

            pipeline.on('error', (err) => {
              console.error(`Stream error for ${filename}`, err.message);
              processedFiles.delete(filename);
            });
          }
        }, 500); //buffer for large amounts/size files
      }
    });

    console.log(`Watching ${watchFolder}`);
  } catch (err) {
    console.error('Database error', err);
  }
}

run();
