sub init()
  m.top.functionName = "executeRequest"
end sub

sub executeRequest()
  requestId = m.top.requestId
  response = RequestJson(m.top.url, m.top.method, m.top.body, m.top.deviceToken)
  response.requestId = requestId
  m.top.result = response
end sub
