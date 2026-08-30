'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
    return () => ipcRenderer.removeListener(channel, callback);
  },
  platform: process.platform,
});