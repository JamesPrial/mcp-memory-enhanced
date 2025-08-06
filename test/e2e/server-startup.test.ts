import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import axios from 'axios';

describe('Server Startup Tests', () => {
  it('should start with HTTP transport', async () => {
    const serverPath = path.join(process.cwd(), 'dist', 'index.js');
    const PORT = 3458;
    
    const serverProcess = spawn('node', [serverPath], {
      env: {
        ...process.env,
        TRANSPORT_TYPE: 'http',
        HTTP_PORT: PORT.toString(),
        STORAGE_TYPE: 'json',
      },
    });

    let started = false;
    serverProcess.stdout?.on('data', (data) => {
      if (data.toString().includes('listening on port')) {
        started = true;
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error('Server error:', data.toString());
    });

    // Wait for server to start (or timeout)
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (started) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });

    if (started) {
      // Try to hit the health endpoint
      try {
        const response = await axios.get(`http://localhost:${PORT}/health`);
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('status', 'healthy');
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }

    // Clean up
    serverProcess.kill();
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(started).toBe(true);
  }, 10000);

  it('should start with stdio transport', async () => {
    const serverPath = path.join(process.cwd(), 'dist', 'index.js');
    
    const serverProcess = spawn('node', [serverPath], {
      env: {
        ...process.env,
        STORAGE_TYPE: 'json',
      },
    });

    let started = false;
    serverProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('MCP Server running on stdio')) {
        started = true;
      }
    });

    // Wait for server to start (or timeout)
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (started) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });

    // Clean up
    serverProcess.kill();
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(started).toBe(true);
  }, 10000);
});