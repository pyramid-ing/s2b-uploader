import { app } from 'electron'
import path from 'node:path'

export interface EnvConfig {
  isDevelopment: boolean
  isPackage: boolean
  appPath: string
  filesPath: string
  downloadsPath: string
}

export function getEnvConfig(): EnvConfig {
  const isPackage = app.isPackaged
  const isDevelopment = !isPackage

  let appPath: string
  let filesPath: string
  let downloadsPath: string

  if (isPackage) {
    // 프로덕션 환경: 앱 경로 기준
    appPath = app.getAppPath()
    filesPath = path.join(appPath, 'dist', 'electron', 'files')
    downloadsPath = path.join(appPath, 'downloads')
  } else {
    // 개발 환경: 프로젝트 루트 기준
    appPath = process.cwd()
    filesPath = path.join(appPath, 'files')
    downloadsPath = path.join(appPath, 'downloads')
  }

  return {
    isDevelopment,
    isPackage,
    appPath,
    filesPath,
    downloadsPath,
  }
}

// 전역 설정 인스턴스
export const envConfig = getEnvConfig()
