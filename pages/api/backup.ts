// pages/backup.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { Client } from 'pg';
import pgp from 'pg-promise';
import AWS from 'aws-sdk';
import fs from 'fs';
import archiver from 'archiver';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

const { S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('Database connection string is undefined');
    }

    const client = new Client(connectionString);

    // Connect to PostgreSQL database
    const db = pgp()(client);
    await db.connect();

    // Generate backup of PostgreSQL database
    const backupFileName = 'database_backup.sql';
    await db.any(`pg_dump -U ${process.env.PGUSER} -d ${process.env.PGDATABASE} > ${backupFileName}`);

    // Create a zip file containing the database backup
    const outputZip = fs.createWriteStream('database_backup.zip');
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level
    });
    archive.pipe(outputZip);
    archive.file(backupFileName, { name: backupFileName });
    archive.finalize();

    // Upload the zip file to AWS S3
    const s3 = new AWS.S3({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY
    });

    const zipFile = fs.readFileSync('database_backup.zip');

    const zipFileStream = new Readable();
    zipFileStream.push(zipFile);
    zipFileStream.push(null); // Signifies the end of the stream

    const params: AWS.S3.PutObjectRequest = {
      Bucket: S3_BUCKET_NAME!,
      Key: 'database_backup.zip',
      Body: zipFileStream
    };

    await s3.upload(params).promise();

    // Cleanup: Remove local backup files
    fs.unlinkSync(backupFileName);
    fs.unlinkSync('database_backup.zip');

    res.status(200).json({ message: 'Backup successfully created and uploaded to AWS S3.' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Error creating or uploading backup.' });
  }
}
