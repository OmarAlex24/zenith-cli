import { GitAdapter } from "../integrations/git/git-adapter";
import { openZenithDatabase, type DatabaseOptions } from "../storage/database";
import { ZenithRepository } from "../storage/repository";
import { ZenithApp } from "./decode-app";

export type AppFactoryOptions = DatabaseOptions & {
  cwd?: string;
};

export function createZenithApp(options: AppFactoryOptions = {}): {
  app: ZenithApp;
  repository: ZenithRepository;
  close: () => void;
} {
  const db = openZenithDatabase(options);
  const repository = new ZenithRepository(db);
  const app = new ZenithApp(repository, new GitAdapter(), options.cwd ?? process.cwd());

  return {
    app,
    repository,
    close: () => repository.close(),
  };
}

export function createDecodeApp(options: AppFactoryOptions = {}) {
  return createZenithApp(options);
}
