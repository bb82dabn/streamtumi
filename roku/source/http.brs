function IsTrustedDeviceApiUrl(url as string) as boolean
  appInfo = CreateObject("roAppInfo")
  origin = appInfo.GetValue("api_origin")
  if origin = invalid or origin = "" then return false
  if Right(origin, 1) = "/" then origin = Left(origin, Len(origin) - 1)
  prefix = origin + "/api/device/v1/"
  if Left(url, Len(prefix)) = prefix then return true
  return url = origin + "/api/roku/v2/rooms/access"
end function

function RequestJson(url as string, method = "GET" as string, body = "" as string, deviceToken = "" as string) as object
  requestMethod = UCase(method)
  if requestMethod = "" then requestMethod = "GET"
  if requestMethod <> "GET" and requestMethod <> "POST"
    return { ok: false, status: 0, error: "Unsupported StreamTumi request method." }
  end if
  if deviceToken <> "" and not IsTrustedDeviceApiUrl(url)
    return { ok: false, status: 0, error: "Scoped device authentication was blocked for this address." }
  end if
  transfer = CreateObject("roUrlTransfer")
  transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
  transfer.InitClientCertificates()
  transfer.RetainBodyOnError(true)
  transfer.AddHeader("Accept", "application/json")
  transfer.AddHeader("User-Agent", "StreamTumi-Roku/1.0")
  deviceInfo = CreateObject("roDeviceInfo")
  channelClientId = deviceInfo.GetChannelClientId()
  if channelClientId <> invalid and channelClientId <> "" then transfer.AddHeader("X-StreamTumi-Client", channelClientId)
  if deviceToken <> "" then transfer.AddHeader("Authorization", "Device " + deviceToken)
  if requestMethod = "POST" then transfer.AddHeader("Content-Type", "application/json")
  transfer.SetUrl(url)
  port = CreateObject("roMessagePort")
  transfer.SetMessagePort(port)
  if requestMethod = "POST"
    started = transfer.AsyncPostFromString(body)
  else
    started = transfer.AsyncGetToString()
  end if
  if not started then return { ok: false, status: 0, error: "StreamTumi request could not be started." }
  event = Wait(15000, port)
  if event = invalid
    transfer.AsyncCancel()
    return { ok: false, status: 0, error: "StreamTumi took too long to respond." }
  end if
  body = event.GetString()
  status = event.GetResponseCode()
  failureReason = event.GetFailureReason()
  if failureReason = invalid then failureReason = ""

  if status <= 0
    message = "StreamTumi could not be reached."
    if failureReason <> "" then message = "Network error: " + failureReason
    return { ok: false, status: status, error: message, errorCode: "transport_error", failureReason: failureReason }
  end if

  if status < 200 or status >= 300
    message = "StreamTumi returned HTTP " + status.ToStr() + "."
    errorCode = ""
    parsedError = invalid
    if body <> invalid and body <> ""
      parsedError = ParseJson(body)
      if parsedError <> invalid and parsedError.error <> invalid
        errorCode = parsedError.error
        if parsedError.code <> invalid then errorCode = parsedError.code
        if errorCode <> "authorization_pending" and errorCode <> "slow_down" and errorCode <> "expired_token" then message = parsedError.error
      end if
    end if
    return { ok: false, status: status, error: message, errorCode: errorCode, failureReason: failureReason, data: parsedError }
  end if

  parsed = ParseJson(body)
  if parsed = invalid then return { ok: false, status: status, error: "StreamTumi returned an unreadable response.", failureReason: failureReason }
  return { ok: true, status: status, failureReason: failureReason, data: parsed }
end function
