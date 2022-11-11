export interface FullReader {
  readFull(buff: Uint8Array): Promise<Uint8Array | null>
}

export type Param = string | number | Date | null

export const enum Format {
  Text = 0,
  Binary = 1,
}

export const enum AuthCode {
  Ok = 0,
  KerberosV5 = 2,
  ClearTextPassword = 3,
  MD5Password = 5,
  SCMCredential = 6,
  GSS = 7,
  Continue = 8,
  SSPI = 9,
  SASL = 10,
  SASLContinue = 11,
  SASLFinal = 12,
}

export const enum ReadyState {
  Idle = 'I',
  Error = 'E',
  Transaction = 'T',
}

export interface ColumnDescription {
  name: string
  table: number | null
  attNum: number | null
  oid: number
  typelen: number
  typemod: number
  format: Format
}

export type Row = Record<string, string | null>

export interface ParseComplete {
  code: '1'
  data: null
}

export interface BindComplete {
  code: '2'
  data: null
}

export interface CloseComplete {
  code: '3'
  data: null
}

export interface CommandComplete {
  code: 'C'
  data: string
}

export interface DataRow {
  code: 'D'
  data: (Uint8Array | null)[]
}

export interface ErrorResponse {
  code: 'E'
  data: {
    S: string
    C: string
    M: string
    [key: string]: string | undefined
  }
}

export interface BackendKeyData {
  code: 'K'
  data: [number, number]
}

export interface NoData {
  code: 'n'
  data: null
}

export interface Authentication {
  code: 'R'
  data: AuthCode
}

export interface ParameterStatus {
  code: 'S'
  data: [string, string]
}

export interface PortalSuspended {
  code: 's'
  data: null
}

export interface RowDescription {
  code: 'T'
  data: ColumnDescription[]
}

export interface ParameterDescription {
  code: 't'
  data: number[]
}

export interface ReadyForQuery {
  code: 'Z'
  data: ReadyState
}

export type Packet =
  | ParseComplete
  | BindComplete
  | CloseComplete
  | CommandComplete
  | DataRow
  | ErrorResponse
  | BackendKeyData
  | NoData
  | Authentication
  | ParameterStatus
  | RowDescription
  | PortalSuspended
  | ParameterDescription
  | ReadyForQuery
