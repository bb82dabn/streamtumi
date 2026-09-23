function ApiOrigin() as string
  appInfo = CreateObject("roAppInfo")
  origin = appInfo.GetValue("api_origin")
  if origin = invalid or origin = "" then return ""
  if Right(origin, 1) = "/" then origin = Left(origin, Len(origin) - 1)
  return origin
end function

function UrlOrigin(value as string) as string
  marker = Instr(0, value, "://")
  if marker = 0 then return ""
  slash = Instr(marker + 3, value, "/")
  if slash = 0 then return value
  return Left(value, slash - 1)
end function

function AbsoluteUrl(origin as string, value as dynamic) as string
  if value = invalid then return ""
  text = value.ToStr()
  if text = "" then return ""
  if Left(text, 7) = "http://" or Left(text, 8) = "https://" then return text
  if Left(text, 1) <> "/" then text = "/" + text
  return origin + text
end function

function SettingEnabled(key as string, fallback = false as boolean) as boolean
  registry = CreateObject("roRegistrySection", "StreamTumi")
  if not registry.Exists(key) then return fallback
  return registry.Read(key) = "true"
end function

sub SaveSetting(key as string, enabled as boolean)
  registry = CreateObject("roRegistrySection", "StreamTumi")
  registry.Write(key, enabled.ToStr())
  registry.Flush()
end sub

function ReadSetting(key as string) as string
  registry = CreateObject("roRegistrySection", "StreamTumi")
  if not registry.Exists(key) then return ""
  return registry.Read(key)
end function

sub SaveTextSetting(key as string, value as string)
  registry = CreateObject("roRegistrySection", "StreamTumi")
  registry.Write(key, value)
  registry.Flush()
end sub

sub DeleteSetting(key as string)
  registry = CreateObject("roRegistrySection", "StreamTumi")
  if registry.Exists(key) then registry.Delete(key)
  registry.Flush()
end sub

function IsUrlSafeToken43(value as dynamic) as boolean
  if value = invalid then return false
  token = value.ToStr()
  if Len(token) <> 43 then return false
  for index = 1 to Len(token)
    code = Asc(Mid(token, index, 1))
    isDigit = code >= 48 and code <= 57
    isUpper = code >= 65 and code <= 90
    isLower = code >= 97 and code <= 122
    if not isDigit and not isUpper and not isLower and code <> 45 and code <> 95 then return false
  end for
  return true
end function

function IsRoomSessionToken(value as dynamic) as boolean
  return IsUrlSafeToken43(value)
end function

function IsDeviceToken(value as dynamic) as boolean
  return IsUrlSafeToken43(value)
end function

function ReadDeviceToken() as string
  token = ReadSetting("deviceToken")
  if token = "" then return ""
  if IsDeviceToken(token) then return token
  DeleteSetting("deviceToken")
  return ""
end function

function ReadRoomSessionTokens() as object
  raw = ReadSetting("roomSessionTokens")
  if raw = "" then return []
  parsed = ParseJson(raw)
  if parsed = invalid or Type(parsed) <> "roArray" then return []
  result = []
  seen = {}
  for each value in parsed
    if IsRoomSessionToken(value) and seen[value] = invalid
      result.Push(value.ToStr())
      seen[value] = true
      if result.Count() = 12 then exit for
    end if
  end for
  return result
end function

sub SaveRoomSessionTokens(values as object)
  result = []
  seen = {}
  for each value in values
    if IsRoomSessionToken(value) and seen[value] = invalid
      result.Push(value.ToStr())
      seen[value] = true
      if result.Count() = 12 then exit for
    end if
  end for
  if result.Count() = 0
    DeleteSetting("roomSessionTokens")
  else
    SaveTextSetting("roomSessionTokens", FormatJson(result))
  end if
end sub
