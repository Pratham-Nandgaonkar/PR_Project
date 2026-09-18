function classifyComment(body) {
  if (!body) return 'informational';
  
  const text = body.toLowerCase();
  
  // Blocking heuristics
  if (text.includes('must') || text.includes('need to') || text.includes('critical') || 
      text.includes('do not merge') || text.includes('required') || text.includes('blocker')) {
    return 'blocking';
  }
  
  // Approval heuristics
  if (text.includes('lgtm') || text.includes('looks good') || text.includes('ship it') || 
      text.includes('+1') || text.includes('approved')) {
    return 'approval';
  }
  
  // Suggestion heuristics
  if (text.includes('nit') || text.includes('consider') || text.includes('maybe') || 
      text.includes('optional') || text.includes('minor') || text.includes('suggestion')) {
    return 'suggestion';
  }
  
  // Question heuristics
  if (text.trim().endsWith('?') || text.includes('why') || text.includes('how ') || 
      text.includes('could you explain') || text.includes('what if')) {
    return 'question';
  }
  
  return 'informational';
}

module.exports = { classifyComment };
