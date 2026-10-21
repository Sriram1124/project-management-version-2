const fs = require("fs");
const path = require("path");

function walk(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (['node_modules', '.git', 'dist', 'build', '.s3-local-data', '.fallow'].includes(file)) continue;
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        results = results.concat(walk(full));
      } else {
        results.push(full);
      }
    }
  } catch (e) {}
  return results;
}

const files = walk(".");
console.log("Total non-ignored files:", files.length);

for (const file of files) {
  try {
    const content = fs.readFileSync(file, "utf8");
    if (content.includes("total_organizations") || 
        content.includes("182") || 
        content.includes("Assertion #20") || 
        content.includes("Assertion #156") ||
        content.includes("kanban_summary") ||
        content.includes("totalOrganizations") ||
        content.includes("postman")) {
      console.log("Match in:", file);
    }
  } catch (e) {}
}

