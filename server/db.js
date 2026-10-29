import tediousSql from 'mssql'
import trustedSql from 'mssql/msnodesqlv8.js'

let poolPromise
const useWindowsAuth = process.env.SQL_AUTH === 'windows'
const sql = useWindowsAuth ? trustedSql : tediousSql

export function getPool() {
  if (!useWindowsAuth && !process.env.SQL_PASSWORD) {
    throw new Error('Chưa cấu hình SQL_PASSWORD trong file .env.')
  }

  if (!poolPromise) {
    const config = useWindowsAuth
      ? {
          server: process.env.SQL_SERVER || '(localdb)\\MSSQLLocalDB',
          database: process.env.SQL_DATABASE || 'SoccerHub',
          options: {
            trustedConnection: true,
            trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE !== 'false'
          },
          pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
        }
      : {
          server: process.env.SQL_SERVER || 'localhost',
          ...(process.env.SQL_PORT ? { port: Number(process.env.SQL_PORT) } : {}),
          database: process.env.SQL_DATABASE || 'SoccerHub',
          user: process.env.SQL_USER || 'sa',
          password: process.env.SQL_PASSWORD,
          options: {
            ...(process.env.SQL_INSTANCE ? { instanceName: process.env.SQL_INSTANCE } : {}),
            encrypt: process.env.SQL_ENCRYPT === 'true',
            trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE !== 'false'
          },
          pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
        }

    poolPromise = sql.connect(config).catch((error) => {
      poolPromise = undefined
      throw error
    })
  }

  return poolPromise
}

export { sql }