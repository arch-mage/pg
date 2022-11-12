export interface FullReader {
  readFull(buff: Uint8Array): Promise<Uint8Array | null>
}

export type TypedArrayMutableProperties =
  | 'copyWithin'
  | 'fill'
  | 'reverse'
  | 'set'
  | 'sort'

export interface ReadonlyUint8Array
  extends Omit<Uint8Array, TypedArrayMutableProperties> {
  readonly [n: number]: number
}

export type Param = Uint8Array | null

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

export interface AuthOk {
  code: AuthCode.Ok
  data: null
}

export interface AuthSASL {
  code: AuthCode.SASL
  data: string[]
}

export interface AuthSASLContinue {
  code: AuthCode.SASLContinue
  data: string
}

export interface AuthSASLFinal {
  code: AuthCode.SASLFinal
  data: string
}

export type AuthData = AuthOk | AuthSASL | AuthSASLContinue | AuthSASLFinal

export type Column = Uint8Array | null

export type Row = Column[]

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

export interface NotificationResponse {
  code: 'A'
  data: Notification
}

export interface CommandComplete {
  code: 'C'
  data: string
}

export interface DataRow {
  code: 'D'
  data: Array<Uint8Array | null>
}

export interface ErrorResponse {
  code: 'E'
  data: MessageFields
}

export interface BackendKeyData {
  code: 'K'
  data: [number, number]
}

export interface NoticeResponse {
  code: 'N'
  data: MessageFields
}

export interface NoData {
  code: 'n'
  data: null
}

export interface Authentication {
  code: 'R'
  data: AuthData
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

export type BackendPacket =
  | ParseComplete
  | BindComplete
  | CloseComplete
  | NotificationResponse
  | CommandComplete
  | DataRow
  | ErrorResponse
  | BackendKeyData
  | NoticeResponse
  | NoData
  | Authentication
  | ParameterStatus
  | RowDescription
  | PortalSuspended
  | ParameterDescription
  | ReadyForQuery

export interface Bind {
  code: 'B'
  data: {
    portal: string
    stmt: string
    paramFormats: Format[]
    params: Param[]
    resultFormats: Format[]
  }
}

export interface Close {
  code: 'C'
  data: {
    kind: 'S' | 'P'
    name: string
  }
}

export interface Describe {
  code: 'D'
  data: {
    kind: 'S' | 'P'
    name: string
  }
}

export interface Execute {
  code: 'E'
  data: {
    max: number
    name: string
  }
}

export interface Parse {
  code: 'P'
  data: {
    query: string
    name: string
    formats: Format[]
  }
}

export interface Password {
  code: 'p'
  data: Uint8Array
}

export interface Query {
  code: 'Q'
  data: string
}

export interface Startup {
  code: null
  data: {
    user: string
    [param: string]: string
  }
}

export interface Sync {
  code: 'S'
}

export interface Terminate {
  code: 'X'
}

export type FrontendPacket =
  | Bind
  | Close
  | Describe
  | Execute
  | Parse
  | Password
  | Query
  | Startup
  | Sync
  | Terminate

export interface IProtocol extends AsyncIterableIterator<BackendPacket> {
  recv(): Promise<BackendPacket | null>
  encode(packet: FrontendPacket): this
  send(): Promise<void>
}

export type NoticeListener = (fields: MessageFields) => void
export type NotificationListener = (
  processId: number,
  channel: string,
  payload: string
) => void
export type ParameterStatusListener = (name: string, data: string) => void
