// restart-server.js
const { exec } = require('child_process');

console.log('Attempting to restart backend server...');

// First let's kill any existing node processes running the backend
exec('pkill -f "node src/index.js"', (error, stdout, stderr) => {
  if (error) {
    console.log('No existing process found or error killing process:', error.message);
  } else {
    console.log('Successfully terminated existing process');
  }
  
  // Now start the server again
  console.log('Starting server...');
  const server = exec('node src/index.js', {
    cwd: process.cwd() // Execute in the current directory
  });
  
  server.stdout.on('data', (data) => {
    console.log(`Server output: ${data}`);
  });
  
  server.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
  });
  
  server.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });
  
  // Wait a bit to see initial server output
  setTimeout(() => {
    console.log('Server has been started. You can press Ctrl+C to detach from this process.');
    console.log('The server will continue running in the background.');
  }, 3000);
});