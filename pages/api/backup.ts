import { NextApiRequest, NextApiResponse } from 'next';
import { exec as execCb } from 'child_process';
import fs from 'fs';
import archiver from 'archiver';
import dotenv from 'dotenv';
import { promisify } from 'util';

dotenv.config();

const exec = promisify(execCb);

async function createDatabaseBackup(dumpFile: string): Promise<void> {
  const { POSTGRES_USER, POSTGRES_DATABASE, POSTGRES_HOST, POSTGRES_PASSWORD } = process.env;

  if (!POSTGRES_USER || !POSTGRES_DATABASE || !POSTGRES_HOST || !POSTGRES_PASSWORD) {
    throw new Error('Database environment variables are not fully set');
  }

  const dumpCommand = `PGPASSWORD=${POSTGRES_PASSWORD} pg_dump -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -d ${POSTGRES_DATABASE} -f ${dumpFile}`;
  await exec(dumpCommand);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const backupFileName = 'database_backup.sql';
    const zipFileName = 'database_backup.zip';

    await createDatabaseBackup(backupFileName);

    // Check if the backup file has been created and has content
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

    // Stream the zip file to the response
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${zipFileName}`);

    const fileStream = fs.createReadStream(zipFileName);
    fileStream.pipe(res);
    fileStream.on('error', error => {
      console.error('Error streaming the zip file:', error);
      res.status(500).end();
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Error creating backup.', error: error instanceof Error ? error.message : String(error) });
  }
}
