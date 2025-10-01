// server/db.js
import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./db/database.sqlite");

// (opsional) hidupkan FK jika kamu punya relasi
db.run("PRAGMA foreign_keys = ON");

export default db;
