// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import "./RsaSizes.t.sol";

/// ONE HARNESS, ONE BASIS.
///
/// Every figure the §3 comparison table needs, measured through the identical
/// Probe path with the identical warm treatment, so that ratios between them
/// are arithmetic on commensurable quantities rather than on a basis mix.
///
/// Inherits RsaSizes solely to reuse its four cryptographically-verified real
/// RSA vectors (1024/1280/2048/4096) and the Probe instance.
contract Unified is RsaSizes {
    // alg-13 verifiers, at their deployed mainnet addresses
    address constant P256_OLD_CURRENT = 0x0faa24e538bA4620165933f68a9d142f79A68091; // pre-#509, current oracle
    address constant P256_OLD_LEGACY  = 0xe571A50F76ff7404F3Ce380D06CBd2c9c6Ca3670; // pre-#509, legacy oracle
    address constant P256_NEW         = 0xB091C4F6FAc16eDDA5Ee1E0f4738f80011905878; // post-#509, EIP-7951

    // RFC 6605 ECDSAP256SHA256 vector
    bytes PK = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
    bytes PD = hex"00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201";
    bytes PS = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";

    // RFC 5702 RSASHA256 vector — the 12,873 figure under audit. 1024-bit modulus
    // but only ~60 bytes of signed data, vs 352-1132 bytes in real ENS proofs.
    bytes RK5702 = hex"0100030803010001c15c1ac6b1c5d822bae1a60a45489b2e21f7d0aa4fb8f0637a5ec4f19c9d416d476161dfa069a27730b6467870082dbdde10b3c3e4c54769ea9fc395498e6dd9";
    bytes RD5702 = hex"0001080300000e1070dbd880386d43802349076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c000025b";
    bytes RS5702 = hex"91108e1fabbb974406cbdaa90bd975b0b9dc25c38a14b27b1a18943a26eee2d798a79544f519dcae24a164dcfce66c2532034469c1582bf94fb4f89560fe1bc2";

    /// warm, deterministic, through the same Probe as every RSA size
    function _warm(address v, bytes memory k, bytes memory d, bytes memory s)
        internal view returns (uint256 g, bool ok)
    {
        p.measure(v, k, d, s);                       // warm the account + code
        (uint256 g2, bool o2) = p.measure(v, k, d, s);
        (uint256 g3,) = p.measure(v, k, d, s);
        require(g2 == g3, "not deterministic");
        return (g2, o2);
    }

    /// measure, assert-verified, and emit in one step — keeps the stack shallow
    function _report(string memory label, address v, bytes memory k, bytes memory d, bytes memory s)
        internal view
    {
        (uint256 g, bool ok) = _warm(v, k, d, s);
        require(ok, "vector must verify");   // gas on a failing vector is meaningless
        console.log(label, g);
    }

    function test_unifiedBasis() public view {
        console.log("UNIFIED-BASIS GAS (warm, via Probe, deployed mainnet bytecode)");
        _report("p256_old_current",   P256_OLD_CURRENT, PK, PD, PS);
        _report("p256_old_legacy",    P256_OLD_LEGACY,  PK, PD, PS);
        _report("p256_new",           P256_NEW,         PK, PD, PS);
        _report("rsa_rfc5702_vector", V8, RK5702, RD5702, RS5702);
        _report("rsa_real_1024",      V8, K1024, D1024, S1024);
        _report("rsa_real_1280",      V8, K1280, D1280, S1280);
        _report("rsa_real_2048",      V8, K2048, D2048, S2048);
        _report("rsa_real_4096",      V8, K4096, D4096, S4096);
    }
}
