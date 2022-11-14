import type { Param } from './definition.ts'

type Format = 0 | 1

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
