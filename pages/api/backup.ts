// pages/api/backup.ts

import { NextApiRequest, NextApiResponse } from 'next';
import pgp from 'pg-promise';
import fs from 'fs';
import archiver from 'archiver';
import dotenv from 'dotenv';

dotenv.config();

async function createDatabaseBackup(dumpFile: string): Promise<void> {
  const { POSTGRES_USER, POSTGRES_DATABASE, POSTGRES_HOST, POSTGRES_PASSWORD, POSTGRES_URL } = process.env;
  
  if (!POSTGRES_USER || !POSTGRES_DATABASE || !POSTGRES_HOST || !POSTGRES_PASSWORD || !POSTGRES_URL) {
    throw new Error('Database environment variables are not fully set');
  }
  // Connect to PostgreSQL database
  const db = pgp()(POSTGRES_URL);
  await db.connect();

  // Generate backup of PostgreSQL database
  const backupFileName = 'database_backup.sql';
  await db.any(`pg_dump -U ${POSTGRES_USER} -d ${POSTGRES_DATABASE} > ${backupFileName}`);

}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const backupFileName = 'database_backup.sql';
    const zipFileName = 'database_backup.zip';

    await createDatabaseBackup(backupFileName);

    // Ensure the backup file was created and has content
    if (!fs.existsSync(backupFileName) || fs.statSync(backupFileName).size === 0) {
      throw new Error('Backup file is empty or not created');
    }

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipFileName);
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('error', reject);
      output.on('close', resolve);

      archive.pipe(output);
      archive.file(backupFileName, { name: backupFileName });
      archive.finalize();
    });

    // Stream the zip file as the response
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${zipFileName}`);

    const fileStream = fs.createReadStream(zipFileName);
    fileStream.pipe(res);
    fileStream.on('end', () => {
      fs.unlinkSync(backupFileName);
      fs.unlinkSync(zipFileName);
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Error creating backup.', error: error instanceof Error ? error.message : String(error) });
  }
}
