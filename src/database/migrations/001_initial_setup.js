/**
 * Initial database setup migration
 * This migration creates the basic tables and relationships for the HelpDesk system
 */

const fs = require('fs');
const path = require('path');

// Read schema.sql
const schemaPath = path.join(__dirname, '..', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

exports.up = async (pgm) => {
  // Execute the schema.sql file to create all tables and initial data
  await pgm.sql(schema);
  
  console.log('Initial database structure created successfully');
};

exports.down = async (pgm) => {
  // Drop all tables in reverse dependency order
  await pgm.sql(`
    DROP TABLE IF EXISTS ticket_metrics CASCADE;
    DROP TABLE IF EXISTS reporting_periods CASCADE;
    DROP TABLE IF EXISTS response_templates CASCADE;
    DROP TABLE IF EXISTS email_log CASCADE;
    DROP TABLE IF EXISTS notifications CASCADE;
    DROP TABLE IF EXISTS ticket_history CASCADE;
    DROP TABLE IF EXISTS attachments CASCADE;
    DROP TABLE IF EXISTS ticket_messages CASCADE;
    DROP TABLE IF EXISTS tickets CASCADE;
    DROP TABLE IF EXISTS statuses CASCADE;
    DROP TABLE IF EXISTS priorities CASCADE;
    DROP TABLE IF EXISTS categories CASCADE;
    DROP TABLE IF EXISTS departments CASCADE;
    DROP TABLE IF EXISTS user_settings CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `);
  
  console.log('All database tables dropped successfully');
};