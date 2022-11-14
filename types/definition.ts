export type Param = Uint8Array | null

export type Column = Uint8Array | null

export type Row = Column[]

export interface ColumnDescription {
  name: string
  table: number | null
  attNum: number | null
  oid: number
  typelen: number
  typemod: number
  format: 0 | 1
}

export interface AuthOk {
  code: 0
  data: null
}

export interface AuthSASL {
  code: 10
  data: string[]
}

export interface AuthSASLContinue {
  code: 11
  data: string
}

export interface AuthSASLFinal {
  code: 12
  data: string
}

export type AuthData = AuthOk | AuthSASL | AuthSASLContinue | AuthSASLFinal

export interface MessageFields {
  S: string
  C: string
  M: string
  [key: string]: string | undefined
}

export interface Notification {
  processId: number
  channel: string
  payload: string
}

export type NoticeListener = (fields: MessageFields) => void
export type NotificationListener = (
  processId: number,
  channel: string,
  payload: string
) => void
export type ParameterStatusListener = (name: string, data: string) => void

export interface FullReader {
  readFull(buff: Uint8Array): Promise<Uint8Array | null>
}
