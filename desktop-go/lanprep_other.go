//go:build !windows

package main

import "fmt"

func init() {
	prepareLAN = func() (func(), error) {
		if hasPCLAN() {
			return func() {}, nil
		}
		return nil, fmt.Errorf("이 PC 에서는 랜 포트 주소를 직접 맞춰 주세요: %s / 255.255.255.0 (로봇 %s).", pcLAN, robotLAN)
	}
}
