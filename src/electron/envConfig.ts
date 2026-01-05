import { app } from 'electron'
import path from 'node:path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface EnvConfig {
  isDevelopment: boolean
  isPackage: boolean
  appPath: string
  filesPath: string
  downloadsPath: string
  tempDir: string
}

export interface SupabaseConfig {
  url: string
  anonKey: string
}

// Supabase 설정
const supabaseConfig: SupabaseConfig = {
  url: 'https://rvubjjtdegnxeaablucf.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2dWJqanRkZWdueGVhYWJsdWNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MjcwMjMsImV4cCI6MjA3NDIwMzAyM30.35GRmArGK3_GHi_DsAsvTusqRCchlbamnmafoFLKnno',
}

// Supabase 클라이언트 생성 및 export
export const supabase: SupabaseClient = createClient(supabaseConfig.url, supabaseConfig.anonKey)

export function getEnvConfig(): EnvConfig {
  const isPackage = app.isPackaged
  const isDevelopment = !isPackage

  let appPath: string
  let filesPath: string
  let downloadsPath: string
  let tempDir: string

  // Electron userData 디렉터리 (업데이트 후에도 유지되는 디렉터리)
  const userDataPath = app.getPath('userData')

  if (isPackage) {
    // 프로덕션 환경: 앱 경로 기준
    appPath = app.getAppPath()
    filesPath = path.join(appPath, 'dist', 'electron', 'files')
    // downloadsPath는 userData 디렉터리 사용 (업데이트 후에도 유지)
    downloadsPath = path.join(userDataPath, 'downloads')
  } else {
    // 개발 환경: 프로젝트 루트 기준
    appPath = process.cwd()
    filesPath = path.join(appPath, 'files')
    downloadsPath = path.join(appPath, 'downloads')
  }

  // Electron userData 디렉터리 기준 temp 폴더
  tempDir = path.join(userDataPath, 'temp')

  return {
    isDevelopment,
    isPackage,
    appPath,
    filesPath,
    downloadsPath,
    tempDir,
  }
}

// 전역 설정 인스턴스
export const envConfig = getEnvConfig()
