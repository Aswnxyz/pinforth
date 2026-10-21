
import { prisma } from "../lib/prisma.js";

async function main() {
  try {
    await prisma.$connect();

    const userCount = await prisma.user.count();

    console.log("Database connection successful!");
    console.log(`Total users: ${userCount}`);
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await main();

