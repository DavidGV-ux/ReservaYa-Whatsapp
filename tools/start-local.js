#!/usr/bin/env node
/**
 * Script para iniciar el servidor local con ngrok
 * Uso: node start-local.js
 */

const { spawn } = require('child_process');
const config = require('./config');

console.log('🚀 Iniciando servidor local...\n');

// Iniciar el servidor
const server = spawn('node', ['index.js'], {
  stdio: 'inherit',
  shell: true
});

server.on('error', (error) => {
  console.error('❌ Error iniciando servidor:', error);
  process.exit(1);
});

// Manejar cierre
process.on('SIGINT', () => {
  console.log('\n🛑 Deteniendo servidor...');
  server.kill();
  process.exit(0);
});

console.log('\n💡 Para usar con ngrok, abre otra terminal y ejecuta:');
console.log(`   ngrok http ${config.port || 3000}\n`);

