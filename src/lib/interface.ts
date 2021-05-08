export interface IConfig {
  host: string;
  port: number;
  clientID: string;
  secret: string;
  spId: string;
  serviceId: string;
  srcId: string;
  ClientVersion?: number;
  heartbeatMaxAttempts?: number;
  heartbeatInterval?: number;
  timeout?: number;
  mobilesPerSecond?: number;
  heartbeatTimeout?: number;
}

export interface IConmmand {
  Login?: number;
  Login_Resp?: number;
  Submit?: number;
  Submit_Resp?: number;
  Deliver?: number;
  Deliver_Resp?: number;
  Active_Test?: 0x00000004;
  Active_Test_Resp?: number;
  Forward?: number;
  Forward_Resp?: number;
  Exit?: number;
  Exit_Resp?: number;
  Query?: number;
  Query_Resp?: number;
  Query_TE_Route?: number;
  Query_TE_Route_Resp?: number;
  Deliver_Report_Cotent?: number;
}

export interface IRequestId {
  0x00000001?: string;
  0x80000001?: string;
  0x00000002?: string;
  0x80000002?: string;
  0x00000003?: string;
  0x80000003?: string;
  0x00000004?: string;
  0x80000004?: string;
  0x00000005?: string;
  0x80000005?: string;
  0x00000006?: string;
  0x80000006?: string;
  0x00000007?: string;
  0x80000007?: string;
  0x00000008?: string;
  0x80000008?: string;
}
export interface IHeader {
  PacketLength?: number;
  RequestID: number;
  SequenceID: number;
}

export interface IField {
  name: string;
  type: string;
  length: number | Function;
}
export interface IStat {
  DELIVRD: string;
  EXPIRED: string;
  DELETED: string;
  UNDELIV: string;
  ACCEPTD: string;
  UNKNOWN: string;
  REJECTD: string;
}

export interface IErr {
  '000': '成功';
  '001': '用户不能通信';
  '002': '用户忙';
  '003': '终端无此部件号';
  '004': '非法用户';
  '005': '用户在黑名单内';
  '006': '系统错误';
  '007': '用户内存满';
  '008': '非信息终端';
  '009': '数据错误';
  '010': '数据丢失';
  '999': '未知错误';
}

export type IReqBody = ILogin | ISubmit | IDeliver;
export type IResBody = ILogin_Resp | ISubmit_Resp | IDeliver_Resp;

export interface ILogin {
  ClientID: string;
  AuthenticatorClient: string;
  LoginMode: number;
  TimeStamp: string;
  ClientVersion: number;
}

export interface ILogin_Resp {
  Status: number;
  AuthenticatorServer: string;
  ServerVersion: number;
  MsgID?: string;
}

export interface ISubmit {
  MsgType: number;
  NeedReport: number;
  Priority: number;
  ServiceID: string;
  FeeType: string;
  FeeCode: string;
  FixedFee: string;
  MsgFormat: number;
  ValidTime: string;
  AtTime: string;
  SrcTermID: string;
  ChargeTermID: string;
  DestTermIDCount: number;
  DestTermID: string;
  MsgLength: number;
  MsgContent: string;
  Reserve: string;
  TP_pid?: number;
  TP_udhi?: number; //长短信时为1
  PkTotal?: number; //长短信总条数
  PkNumber?: number; //长短信序号
  length?: number;
  smsNo?: number;
}

export interface ISubmit_Resp {
  MsgID: string;
  Status: number;
}

export interface IDeliver {
  MsgID: string;
  IsReport: number;
  MsgFormat: number;
  RecvTime: string;
  SrcTermID: string;
  DestTermID: string;
  MsgLength: number;
  MsgContent: string | IDeliver_Report_Cotent;
  Reserve: string;
}

export interface IDeliver_Report_Cotent {
  MsgID: string;
  sub: string;
  Dlvrd: string;
  Submit_date: string;
  done_date: string;
  Err: string;
  Txt: string;
}

export interface IDeliver_Resp {
  MsgID: string;
  Status: number;
}

export interface IServerConf {
  host: string;
  port: number;
  LoginRes: (loginResMsg: { header: IHeader; body: ILogin }) => ILogin_Resp;
  SubmitRes: (submitResMsg: { header: IHeader; body: ISubmit }) => ISubmit_Resp;
  DeliverRes: (deliverResMsg: { header: IHeader; body: IDeliver_Resp }) => void;
  // Deliver: (deliverMsg: { header: IHeader; body: IDeliver | IDeliver_Report_Cotent }) => void;
}
