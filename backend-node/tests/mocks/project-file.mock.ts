export interface MockFileRecord {
  file_id: string;
  project_id: string;
  organization_id: string;
  name: string;
  original_name: string;
  document_type: string;
  mime_type: string;
  file_size_bytes: number;
  storage_provider: 's3' | 'local';
  storage_key: string;
  checksum_sha256: string;
  uploaded_by: string;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
}

const store = new Map<string, MockFileRecord>();

export const mockProjectFileStore = {
  get: (id: string) => store.get(id),
  getAll: () => Array.from(store.values()),
  set: (id: string, doc: MockFileRecord) => store.set(id, doc),
  delete: (id: string) => store.delete(id),
  clear: () => store.clear(),
};

const wrapDoc = (raw: MockFileRecord) => {
  const doc: any = {
    ...raw,
    id: raw.file_id,
    _id: raw.file_id,
    toJSON: () => ({ ...raw, id: raw.file_id }),
    toObject: () => ({ ...raw, id: raw.file_id }),
    save: async function () {
      raw.name = this.name;
      raw.document_type = this.document_type;
      raw.is_archived = this.is_archived;
      raw.updated_at = new Date();
      store.set(raw.file_id, raw);
      return this;
    },
  };
  return doc;
};

export const MockProjectFile = {
  create: jest.fn(async (input: any) => {
    const data = Array.isArray(input) ? input[0] : input;
    const record: MockFileRecord = {
      file_id: data.file_id,
      project_id: data.project_id,
      organization_id: data.organization_id || 'org-test-1',
      name: data.name,
      original_name: data.original_name || data.name,
      document_type: data.document_type || 'bin',
      mime_type: data.mime_type || 'application/octet-stream',
      file_size_bytes: data.file_size_bytes || 0,
      storage_provider: data.storage_provider || 's3',
      storage_key: data.storage_key,
      checksum_sha256: data.checksum_sha256 || 'mock-sha',
      uploaded_by: data.uploaded_by || 'user-1',
      is_archived: Boolean(data.is_archived),
      created_at: new Date(),
      updated_at: new Date(),
    };
    store.set(record.file_id, record);
    return wrapDoc(record);
  }),

  findOne: jest.fn((filter: any) => {
    const exec = async () => {
      const records = Array.from(store.values());
      for (const raw of records) {
        let match = true;
        if (filter.file_id && raw.file_id !== filter.file_id) match = false;
        if (filter.project_id && raw.project_id !== filter.project_id) match = false;
        if (filter.is_archived !== undefined && raw.is_archived !== filter.is_archived) match = false;
        if (match) return wrapDoc(raw);
      }
      return null;
    };

    return {
      sort: () => ({
        lean: exec,
        exec,
        then: (resolve: any, reject: any) => exec().then(resolve, reject),
      }),
      lean: exec,
      exec,
      then: (resolve: any, reject: any) => exec().then(resolve, reject),
      catch: (reject: any) => exec().catch(reject),
    };
  }),

  find: jest.fn((filter: any) => {
    const exec = async () => {
      const records = Array.from(store.values());
      const results: any[] = [];
      for (const raw of records) {
        let match = true;
        if (filter.project_id && raw.project_id !== filter.project_id) match = false;
        if (filter.is_archived !== undefined && raw.is_archived !== filter.is_archived) match = false;
        if (match) results.push({ ...raw, id: raw.file_id });
      }
      return results;
    };

    return {
      sort: () => ({
        lean: exec,
        exec,
        then: (resolve: any, reject: any) => exec().then(resolve, reject),
      }),
      lean: exec,
      exec,
      then: (resolve: any, reject: any) => exec().then(resolve, reject),
      catch: (reject: any) => exec().catch(reject),
    };
  }),

  deleteOne: jest.fn(async (filter: any) => {
    for (const [id, raw] of store.entries()) {
      if (filter._id === id || filter.file_id === id) {
        store.delete(id);
        return { deletedCount: 1 };
      }
    }
    return { deletedCount: 0 };
  }),

  deleteMany: jest.fn(async (filter: any) => {
    let count = 0;
    for (const [id, raw] of store.entries()) {
      if (!filter || !filter.project_id || raw.project_id === filter.project_id) {
        store.delete(id);
        count++;
      }
    }
    return { deletedCount: count };
  }),

  updateOne: jest.fn(async (filter: any, update: any) => {
    const raw = store.get(filter.file_id);
    if (raw && update.$set) {
      Object.assign(raw, update.$set);
      store.set(filter.file_id, raw);
      return { modifiedCount: 1 };
    }
    return { modifiedCount: 0 };
  }),
};

