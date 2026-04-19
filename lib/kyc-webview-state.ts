let _kycWebviewDidLoad = false;

export function setKycWebviewDidLoad(val: boolean) {
  _kycWebviewDidLoad = val;
}

export function getKycWebviewDidLoad(): boolean {
  return _kycWebviewDidLoad;
}
