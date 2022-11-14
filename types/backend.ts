import type {
  AuthData,
  Notification,
  MessageFields,
  ColumnDescription,
} from './definition.ts'

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
  data: 'I' | 'T' | 'E'
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

// CopyBothResponse (B)
// CopyInResponse (B)
// CopyOutResponse (B)
// EmptyQueryResponse (B)
// FunctionCallResponse (B)
// NegotiateProtocolVersion (B)
// CopyData (F & B)
// CopyDone (F & B)
