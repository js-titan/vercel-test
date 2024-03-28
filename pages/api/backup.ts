// pages/api/backup.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import fs from 'fs';
import archiver from 'archiver';
import dotenv from 'dotenv';
import { promisify } from 'util';

dotenv.config();

const execAsync = promisify(exec);

async function createDatabaseBackup(dumpFile: string): Promise<void> {
  const { POSTGRES_USER, POSTGRES_DATABASE, POSTGRES_HOST, POSTGRES_PASSWORD } = process.env;

  if (!POSTGRES_USER || !POSTGRES_DATABASE || !POSTGRES_HOST || !POSTGRES_PASSWORD) {
    throw new Error('Database environment variables are not fully set');
  }

  const dumpCommand = `PGPASSWORD=${POSTGRES_PASSWORD} pg_dump -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -d ${POSTGRES_DATABASE} -f ${dumpFile}`;
  await execAsync(dumpCommand);
}

async function zipBackupFile(inputFile: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputFile);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.file(inputFile, { name: inputFile });
    archive.finalize();
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const backupFileName = 'database_backup.sql';
    const zipFileName = 'database_backup.zip';

    await createDatabaseBackup(backupFileName);
    await zipBackupFile(backupFileName, zipFileName);

    res.status(200).json({ message: 'Backup successfully created and stored locally.' });

    // Optionally, remove the SQL dump file after zipping to save space
    fs.unlinkSync(backupFileName);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Error creating backup.', error: error instanceof Error ? error.message : String(error) });
  }
}
