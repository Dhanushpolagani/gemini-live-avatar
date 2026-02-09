

export interface FileSystemTools {
  directoryHandle: FileSystemDirectoryHandle | null;
  listFiles: () => Promise<string[]>;
  readFile: (filename: string) => Promise<string>;
  writeFile: (filename: string, content: string) => Promise<string>;
}

export class FileSystemManager implements FileSystemTools {
  directoryHandle: FileSystemDirectoryHandle | null = null;

  async setDirectoryHandle(handle: FileSystemDirectoryHandle) {
    this.directoryHandle = handle;
    // Verify permission
    const handleAny = handle as any;
    const permission = await handleAny.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      await handleAny.requestPermission({ mode: 'readwrite' });
    }
  }

  async listFiles(): Promise<string[]> {
    if (!this.directoryHandle) throw new Error("No directory connected.");
    const files: string[] = [];
    // @ts-ignore - TS definitions for File System Access API might be missing in some setups
    for await (const entry of this.directoryHandle.values()) {
      if (entry.kind === 'file') {
        files.push(entry.name);
      }
    }
    return files;
  }

  async readFile(filename: string): Promise<string> {
    if (!this.directoryHandle) throw new Error("No directory connected.");
    try {
      const fileHandle = await this.directoryHandle.getFileHandle(filename);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (e) {
      throw new Error(`Could not read file ${filename}: ${e}`);
    }
  }

  async writeFile(filename: string, content: string): Promise<string> {
    if (!this.directoryHandle) throw new Error("No directory connected.");
    try {
      const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
      // @ts-ignore
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return `Successfully wrote to ${filename}`;
    } catch (e) {
      throw new Error(`Could not write file ${filename}: ${e}`);
    }
  }
}