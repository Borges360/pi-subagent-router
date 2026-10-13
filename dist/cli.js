#!/usr/bin/env node
import { cli } from "./common/cli.js";
import { createService } from "./router.js";
await cli("pi-subagent-router", createService);
