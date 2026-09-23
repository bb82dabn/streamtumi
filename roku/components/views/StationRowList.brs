function onKeyEvent(key as string, press as boolean) as boolean
  if not press then return false
  if key = "OK" or key = "select"
    m.top.selectPressed = true
    return true
  end if
  return false
end function
