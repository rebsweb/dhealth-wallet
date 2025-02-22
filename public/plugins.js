/*
 * Copyright 2021-present [Using Blockchain Ltd](https://using-blockchain.org), All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * --------------------------------------------------------------------------------------
 * @package       dHealth Wallet
 * @description   This file defines routines to inject plugins to an Electron app.
 * --------------------------------------------------------------------------------------
 */
const path = require('path')
const fs = require('fs')
const rimraf = require('rimraf')
const { app, ipcMain } = require('electron')
const pluginManager = require('electron-plugin-manager')

/**
 * --------------------------------------------------------------------------------------
 * @class         AppPluginInstaller
 * @description   This class is responsible for initializing plugins and creates an
 *                injecter to register plugins in a Vue app. `electron-plugin-manager` is
 *                used internally to permit installing any NPM module.
 * --------------------------------------------------------------------------------------
 */
 class AppPluginInstaller {
  constructor(ipcMain, options) {
    // Setup filesystem paths
    this.dataPath = options.dataPath
    this.pluginsPath = path.join(__dirname, `plugins`)
    this.pluginsConfPath = path.join(__dirname, `plugins${path.sep}plugins.json`)
    this.injecterPath = path.join(__dirname, `plugins${path.sep}plugins.js`)
    this.singlePlugin = 'plugin' in options ? options.plugin : undefined;

    // Evaluate filesystem and setup
    this.setupFilesystem()

    // Load plugins for registration
    this.loadPlugins().then(
      (plugins) => {
        console.log("[INFO][public/plugins.js] Installed plugins: ", plugins)
        process.exit(0)
      }
    )
  }

  setupFilesystem() {
    // Make filesystem compliant
    if (!fs.existsSync(this.pluginsConfPath)) {
      // Create empty plugins config
      fs.writeFileSync(this.pluginsConfPath, JSON.stringify({}), {mode: 0o644})
    }

    return this
  }

  async loadPlugins() {

    // Link plugin manager to main IPC event emitter
    pluginManager.manager(ipcMain);

    // Reads the plugins.json configuration file
    const pluginsConfig = JSON.parse(fs.readFileSync(this.pluginsConfPath))
    const plugins = Object.keys(pluginsConfig)

    return new Promise(async (resolve) => {

      // Each plugin is *installed* and loaded individually
      this.plugins = []
      for (let i in plugins) {
        // Read basic plugin information
        const pluginSlug = plugins[i]
        const pluginVer  = pluginsConfig[pluginSlug]
        const installPath = path.join(this.pluginsPath, pluginSlug)

        try {
          // Read package information
          let json = fs.readFileSync(path.join(installPath, 'package.json'))
          let pkg  = JSON.parse(json)

          // Merge loaded plugin and package information
          this.plugins.push({
            npmModule: pkg.name,
            installPath: `${installPath.replace(/(.*)(plugins([\/\\]).*)/, '.$3$2')}`, // e.g. "./plugins/@dhealthdapps/health-to-earn"
            name: pluginSlug,
            version: pkg.version,
            main: pkg.main,
            // data from `package.json`
            author: pkg && 'author' in pkg && typeof pkg.author === 'string' ? {name: pkg.author} : pkg.author,
            description: pkg && 'description' in pkg ? pkg.description : '',
            homepage: pkg && 'homepage' in pkg ? pkg.homepage : '',
            repository: pkg && 'repository' in pkg ? pkg.repository : '',
            dependencies: pkg && 'dependencies' in pkg ? pkg.dependencies : {},
          })
        }
        catch (e) {
          console.log(`[ERROR][public/plugins.js] Aborting installation for ${pluginSlug}@${pluginVer} located at ${installPath}.`)
          console.error(e)
          continue // incompatibiliy should not break install process
        }
      }

      this.createInjecter()
      return resolve(this.plugins)
    })
  }

  createInjecter() {
    // Adds auto-generation notice
    let injecterSource = `/**
 * This file is auto-generated using dHealth Wallet
 *
 * You should never modify the content of this file
 * unless you know what you are doing.
 *
 * The method AppPluginInstaller.createInjecter  is
 * responsible for generating this file.
 */\n`;

    // Adds plugins "require" calls
    this.plugins.forEach(
      (p, i) => injecterSource += `
const plugin${i} = require('${p.npmModule}');`);

    // Prepares Vue components available in plugins
    injecterSource += `\n
/**
 * This method registers components and settings of
 * installed plugins and updates storage to contain
 * the correct reference to modules.
 *
 * @param   {Vue}   $app  The Vue instance.
 * @param   {any}   p     The imported NPM module.
 * @returns {void}
 */
const registerPlugin = ($app, p) => {
  console.log("[DEBUG][plugins/plugins.js] components are: ", p.module.components);

  // Registers components
  Object.keys(p.module.components).forEach(
    k => $app.component(k, p.module.components[k])
  );

  // Stops here with missing IPC
  if (!('electron' in window) || !('ipcRenderer' in window['electron'])) {
    return ;
  }

  // Persists loaded plugin details
  // Component data is ignored here
  const entryPoint = p.path + '/' + p.main;
  const loadedPlugin = p.module;
  window.electron.ipcRenderer.send('onPluginLoaded', JSON.stringify({
    npmModule: p.plugin,
    entryPoint,
    installPath: p.path,
    name: loadedPlugin && 'name' in loadedPlugin ? loadedPlugin.name : p.plugin,
    friendlyName: loadedPlugin && 'friendlyName' in loadedPlugin ? loadedPlugin.friendlyName : p.plugin,
    view: loadedPlugin && 'view' in loadedPlugin ? loadedPlugin.view : '',
    routes: loadedPlugin && 'routes' in loadedPlugin ? loadedPlugin.routes : [],
    components: loadedPlugin && 'components' in loadedPlugin ? Object.keys(loadedPlugin.components) : [],
    storages: loadedPlugin && 'storages' in loadedPlugin ? loadedPlugin.storages : [],
    settings: loadedPlugin && 'settings' in loadedPlugin ? loadedPlugin.settings : [],
    permissions: loadedPlugin && 'permissions' in loadedPlugin ? loadedPlugin.permissions : [],
  }));
};`;

    // Creates plugin injecter function to be used in renderer
    injecterSource += `\n
/**
 * This object serves as an installable Vue plugin.
 *
 * @example
 * Vue.use(window['PluginInjecter']);
 */
window.PluginInjecter = {
  install($app, opts) {\n`;

  this.plugins.forEach(
    (p, i) => injecterSource += `
    registerPlugin($app, {
      plugin: '${p.npmModule}',
      module: plugin${i}.default,
      path: '${p.installPath}',
      main: '${p.main}'
    });
`);

    // Closes install() and PluginInjecter
    injecterSource += `
  }
};`;

    console.log(`[INFO][public/plugins.js] Now creating injecter at ${this.injecterPath}`);

    //XXX add file hash to identify updates to injecter
    //XXX add tree hash to identify plugin updates

    // Saves plugins.js in plugins/
    fs.writeFileSync(this.injecterPath, injecterSource, {mode: 0o644});
  }
}

/**
 * --------------------------------------------------------------------------------------
 * @description   The following block is responsible for initializing the filesystem and
 *                the plugins manager.  This routine will install plugins using electron
 *                plugin manager: `electron-plugin-manager` and create an auto-generated
 *                plugins injecter file in `plugins/plugins.js` which is loaded into the
 *                Vue app using `src/injecter.ts`.
 * --------------------------------------------------------------------------------------
 */
// Reads command line arguments to find single plugin identifier
let which = undefined;
if (!!process.argv && process.argv.length === 3) {
  which = process.argv[2];
}

// Set the path of the folder where the persisted data is stored
app.setPath('userData', path.join(app.getPath('home'), '.dhealth-wallet'))

// Prepare plugins manager
new AppPluginInstaller(ipcMain, {
  dataPath: app.getPath('userData'),
  plugin: which,
})
