import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const appDataDirectory = app.getPath('appData')

export const legacyUserDataDirectory = path.join(appDataDirectory, 'voidhud')
export const userDataDirectory = path.join(appDataDirectory, 'mytvhud')

fs.mkdirSync(userDataDirectory, { recursive: true })
app.setPath('userData', userDataDirectory)
