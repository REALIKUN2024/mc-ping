const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const apiDir = path.join(__dirname, "..", "src", "app", "api");
const backupDir = path.join(__dirname, "..", "src", "api-backup");
const nextDir = path.join(__dirname, "..", ".next");
const outDir = path.join(__dirname, "..", "out");

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true });
}
function move(src, dest) {
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
  }
}

rm(nextDir);
rm(outDir);
move(apiDir, backupDir);
try {
  execSync("cross-env EXPORT=1 next build", { stdio: "inherit" });
} finally {
  move(backupDir, apiDir);
}
