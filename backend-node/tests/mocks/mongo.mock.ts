import S3rver from 's3rver';
import path from 'path';
import fs from 'fs';
import * as mongoLib from '../../src/lib/mongodb';
import { ProjectFile } from '../../src/models/project-file.model';

export class MongoMockHelper {
  private static store: Map<string, any> = new Map();
  private static s3Instance: any = null;
  private static s3Dir = path.join(process.cwd(), '.s3-test-data');

  public static async startS3(): Promise<void> {
    if (!fs.existsSync(this.s3Dir)) {
      fs.mkdirSync(this.s3Dir, { recursive: true });
    }

    this.s3Instance = new S3rver({
      port: 9000,
      address: '127.0.0.1',
      directory: this.s3Dir,
      silent: true,
      configureBuckets: [{ name: 'internhub-project-files' }],
    });

    await new Promise<void>((resolve, reject) => {
      this.s3Instance.run((err: any) => {
        if (err && err.code !== 'EADDRINUSE') return reject(err);
        resolve();
      });
    });
  }

  public static async stopS3(): Promise<void> {
    if (this.s3Instance) {
      await new Promise<void>((resolve) => {
        this.s3Instance.close(() => resolve());
      });
      this.s3Instance = null;
    }
    try {
      fs.rmSync(this.s3Dir, { recursive: true, force: true });
    } catch {}
  }

  public static setupMocks(): void {
    if (process.env.MONGODB_URI) return; // Use real MongoDB if URI is configured

    jest.spyOn(mongoLib, 'connectMongoDB').mockResolvedValue(null as any);
    jest.spyOn(mongoLib, 'disconnectMongoDB').mockResolvedValue(undefined);
    jest.spyOn(mongoLib, 'isMongoConnected').mockReturnValue(true);

    this.store.clear();

    const wrapDoc = (data: any) => ({
      ...data,
      id: data.file_id,
      _id: data._id || data.file_id,
      toJSON: () => ({ ...data, id: data.file_id }),
      toObject: () => ({ ...data, id: data.file_id }),
      save: async function () {
        MongoMockHelper.store.set(data.file_id, this);
        return this;
      },
    });

    (jest.spyOn(ProjectFile, 'create') as any).mockImplementation(async (input: any) => {
      const docData = Array.isArray(input) ? input[0] : input;
      const wrapped = wrapDoc({
        ...docData,
        _id: docData._id || docData.file_id,
        created_at: new Date(),
        updated_at: new Date(),
      });
      MongoMockHelper.store.set(wrapped.file_id, wrapped);
      return wrapped as any;
    });

    (jest.spyOn(ProjectFile, 'findOne') as any).mockImplementation((filter: any) => {
      const exec = async () => {
        for (const doc of MongoMockHelper.store.values()) {
          let match = true;
          if (filter.file_id && doc.file_id !== filter.file_id) match = false;
          if (filter.project_id && doc.project_id !== filter.project_id) match = false;
          if (filter.is_archived !== undefined && doc.is_archived !== filter.is_archived) match = false;
          if (match) return wrapDoc(doc);
        }
        return null;
      };

      return {
        sort: () => ({ lean: exec, exec, then: (res: any, rej: any) => exec().then(res, rej) }),
        lean: exec,
        exec,
        then: (resolve: any, reject: any) => exec().then(resolve, reject),
      } as any;
    });

    (jest.spyOn(ProjectFile, 'find') as any).mockImplementation((filter: any) => {
      const exec = async () => {
        const results = [];
        for (const doc of MongoMockHelper.store.values()) {
          let match = true;
          if (filter.project_id && doc.project_id !== filter.project_id) match = false;
          if (filter.is_archived !== undefined && doc.is_archived !== filter.is_archived) match = false;
          if (match) results.push(wrapDoc(doc));
        }
        return results;
      };

      return {
        sort: () => ({ lean: exec, exec, then: (res: any, rej: any) => exec().then(res, rej) }),
        lean: exec,
        exec,
        then: (resolve: any, reject: any) => exec().then(resolve, reject),
      } as any;
    });

    (jest.spyOn(ProjectFile, 'deleteOne') as any).mockImplementation((filter: any) => {
      const exec = async () => {
        for (const [key, doc] of MongoMockHelper.store.entries()) {
          if (filter._id === doc._id || filter.file_id === doc.file_id) {
            MongoMockHelper.store.delete(key);
            return { deletedCount: 1 };
          }
        }
        return { deletedCount: 0 };
      };
      return {
        exec,
        then: (resolve: any, reject: any) => exec().then(resolve, reject),
        catch: (reject: any) => exec().catch(reject),
      } as any;
    });

    (jest.spyOn(ProjectFile, 'deleteMany') as any).mockImplementation((filter: any) => {
      const exec = async () => {
        let count = 0;
        for (const [key, doc] of MongoMockHelper.store.entries()) {
          if (!filter || !filter.project_id || doc.project_id === filter.project_id) {
            MongoMockHelper.store.delete(key);
            count++;
          }
        }
        return { deletedCount: count };
      };
      return {
        exec,
        then: (resolve: any, reject: any) => exec().then(resolve, reject),
        catch: (reject: any) => exec().catch(reject),
      } as any;
    });

    (jest.spyOn(ProjectFile, 'updateOne') as any).mockImplementation((filter: any, update: any) => {
      const exec = async () => {
        const doc = MongoMockHelper.store.get(filter.file_id);
        if (doc && update.$set) {
          Object.assign(doc, update.$set);
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      };
      return {
        exec,
        then: (resolve: any, reject: any) => exec().then(resolve, reject),
        catch: (reject: any) => exec().catch(reject),
      } as any;
    });
  }

  public static clear(): void {
    this.store.clear();
  }
}

