const { MongoClient } = require('mongodb');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function exportFile(doc) {
  const outputFolder = path.join(__dirname, 'outputs');
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  const outputPath = path.join(outputFolder, doc.filename);
  fs.writeFileSync(outputPath, JSON.stringify(doc.data, null, 2));
  console.log(`Exported: ${doc.filename}`);
}

async function run() {
  try {
    await client.connect();
    const db = client.db('fileUploader');
    const collection = db.collection('jsonFiles');

    const action = await prompt(`Options:
1 - Show all files
2 - Search by filename
3 - Search by field (e.g., name = john, etc)
> `);

    if (action === '1') {
      const files = await collection.find({}, { projection: { filename: 1 } }).toArray();
      console.log("\nAll Files:");
      files.forEach(file => console.log(`- ${file.filename}`));

    } else if (action === '2') {
      const filename = await prompt("Enter the filename to search: ");
      const result = await collection.findOne({ filename });

      if (result) {
        console.log("\nResult:");
        console.dir(result.data, { depth: null });

        const shouldExport = await prompt(`Export "${filename}" to outputs/? (y/n): `);
        if (shouldExport.toLowerCase() === 'y') {
          await exportFile(result);
        }
      } else {
        console.log("File not found");
      }

    } else if (action === '3') {
      const field = await prompt("Enter field name (e.g., name, address.city): ");
      const value = await prompt("Enter value to match: ");
      const query = {};
      query[`data.${field}`] = value;

      const results = await collection.find(query).toArray();

      if (results.length === 0) {
        console.log("No matching files found");
        return;
      }

      console.log(`\nFound ${results.length} matches:`);
      results.forEach(doc => {
        console.log(`- ${doc.filename}`);
        console.dir(doc.data, { depth: null });
      });

      const exportChoice = await prompt(`
Export:
1 - One file
2 - All results
3 - Skip export
> `);

      if (exportChoice === '1') {
        const exportName = await prompt("Enter a filename from the list to export: ");
        const docToExport = results.find(d => d.filename === exportName);
        if (docToExport) {
          await exportFile(docToExport);
        } else {
          console.log("Filename not found");
        }
      } else if (exportChoice === '2') {
        for (const doc of results) {
          await exportFile(doc);
        }
        console.log(`Exported ${results.length} files`);
      } else {
        console.log("Export skipped");
      }
    } else {
      console.log("Invalid action");
    }

  } catch (err) {
    console.error("Error ", err);
  } finally {
    rl.close();
    await client.close();
  }
}

run();
