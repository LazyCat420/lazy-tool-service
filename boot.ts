import { bootstrapLocalEnvironment } from "./src/bootstrap.js";

bootstrapLocalEnvironment();

await import("./src/server.js");
