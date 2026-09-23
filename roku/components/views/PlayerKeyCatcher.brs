function onKeyEvent(key as string, press as boolean) as boolean
  if not press then return false
  if key = "back" or key = "options" or key = "info" or key = "play" or key = "right" or key = "left" or key = "up" or key = "down" or key = "OK" or key = "select" or key = "fastforward" or key = "rewind" or key = "replay"
    m.top.keyPressed = key
    return true
  end if
  return false
end function
