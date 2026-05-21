declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  export class StatementSync {
    run(...values: readonly unknown[]): unknown;
    get(...values: readonly unknown[]): unknown;
    all(...values: readonly unknown[]): unknown[];
  }
}
