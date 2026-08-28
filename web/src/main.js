import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import 'vue-sonner/style.css'
import './styles/base.css'
import './styles/settings-controls.css'
import './styles/spot-dialog.css'
import './styles/installer.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
